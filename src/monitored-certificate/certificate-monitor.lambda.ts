import * as tls from 'tls';

import { metricScope, Unit } from 'aws-embedded-metrics';
import type { Context, ScheduledEvent } from 'aws-lambda';
import { requireEnv } from '../backend/shared/env.lambda-shared';

/**
 * Obtains the TLS certificate used by the HTTPS endpoint designated by the
 * `HTTPS_ENDPOINT` environment variable, checks how many validity days remain
 * for this endpoint, and produces a CloudWatch metric under the namespace
 * designated by `METRIC_NAMESPACE`, named as specified by `METRIC_NAME`.
 *
 * If the certificate is past expiration, the metric will be trimmed to `0`
 * instead of turning into negative values.
 */
export const handler = metricScope((metrics) => async (event: ScheduledEvent, _context: Context) => {
  console.log(`Event: ${JSON.stringify(event, null, 2)}`);

  const endpoint = requireEnv('HTTPS_ENDPOINT');
  const metricNamespace = requireEnv('METRIC_NAMESPACE');
  const metricName = requireEnv('METRIC_NAME');

  const now = new Date();

  const daysRemaining = await tlsValidDaysRemaining(endpoint, now);
  console.log(`The certificate has ${daysRemaining} remaining validity days`);

  metrics.setDimensions({ DomainName: endpoint });
  metrics.setNamespace(metricNamespace);
  metrics.putMetric(metricName, daysRemaining, Unit.Count);
});

/**
 * Obtains the remaining validity days from the provided `endpoint`. This
 * establishes a TLS connection to the `endpoint` on port `443`, and assesses
 * the `valid_to` value therein. This function also works with endpoints that
 * require SNI in order to present a certificate (as is the case for API Gateway
 * and CloudFront, for example). It does however not bother with ALPN protocols.
 *
 * @param endpoint the domain name for which a certificate is needed.
 * @param now      the date to use as the `now` reference point.
 *
 * @returns the amount of days the certificate is still valid for, or `0` if the
 *          certificate has already expired.
 */
function tlsValidDaysRemaining(endpoint: string, now: Date): Promise<number> {
  console.log(`Checking remaining validity time for certificate on ${endpoint}:443`);
  const sock = tls.connect({
    host: endpoint,
    port: 443,
    servername: endpoint,
  });
  // "Cleanly" terminates the socket connection, so it does not leak
  const closeThen = (cb: () => void) => sock.end(() => {
    sock.destroy();
    sock.unref();
    cb();
  });
  return new Promise<number>((resolve, reject) => {
    const ok = (val: number) => closeThen(() => resolve(val));
    const ko = (reason: any) => closeThen(() => reject(reason));

    try {
      sock.once('error', (err) => err.code === 'CERT_HAS_EXPIRED' ? ok(0) : ko(err));
      sock.once('secureConnect', () => {
        const cert = sock.getPeerCertificate();
        console.log(`Secure connection established: ${cert.fingerprint256} is valid from ${cert.valid_from} until ${cert.valid_to}`);
        const remainingMillis = new Date(cert.valid_to).getTime() - now.getTime();
        if (remainingMillis < 0) {
          console.error(`The certificate expired ${remainingMillis}ms ago!`);
          ok(0);
          return;
        }
        // Converting to days (there are 86,400,000 milliseconds in a day)
        ok(remainingMillis / 86_400_000);
      });
    } catch (e) {
      ko(e);
    }
  });
}
