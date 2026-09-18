import winston from 'winston';
const nrWinston = require('@newrelic/winston-enricher')(winston);

// New Relic APM instrumentation (newrelic.js / `-r newrelic`) stays in place
// project-wide. This enricher only adds New Relic trace metadata to the
// winston format; it does not by itself ship logs anywhere. Log *forwarding*
// now goes to Better Stack (logtail.com) below instead of New Relic.
const transports: winston.transport[] = [
    new winston.transports.Console({
        silent: true
    })
];

// Better Stack (Logtail) log forwarding — only enabled when a source token
// is configured, so local/dev/test runs without BETTERSTACK_SOURCE_TOKEN set
// never attempt to ship logs anywhere.
if (process.env.BETTERSTACK_SOURCE_TOKEN) {
    const { Logtail } = require('@logtail/node');
    const { LogtailTransport } = require('@logtail/winston');

    const ingestingHost = process.env.BETTERSTACK_INGESTING_HOST;
    const endpoint = ingestingHost
        ? (ingestingHost.startsWith("http://") || ingestingHost.startsWith("https://")
            ? ingestingHost
            : `https://${ingestingHost}`)
        : undefined;

    const logtail = new Logtail(process.env.BETTERSTACK_SOURCE_TOKEN, {
        endpoint,
    });

    transports.push(new LogtailTransport(logtail));
}

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        nrWinston(), // Keeps New Relic APM trace metadata on log lines
        winston.format.json()
    ),
    transports,
});

export default logger;
