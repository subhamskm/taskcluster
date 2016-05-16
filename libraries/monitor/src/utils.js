/*
 * These are functions that are useful in many common use
 * cases within Taskcluster projects. They should take an
 * monitor to operate on as their first argument and return
 * a function so that the real and fake classes can share
 * them.
 */
let debug = require('debug')('taskcluster-lib-monitor');
let usage = require('usage');

/**
 * Given an express api method, this will time it
 * and report via the monitor.
 */
export function expressMiddleware (monitor, name) {
  return (req, res, next) => {
    let sent = false;
    let start = process.hrtime();
    let send = () => {
      try {
        // Avoid sending twice
        if (sent) {
          return;
        }
        sent = true;

        let d = process.hrtime(start);

        let success = 'success';
        if (res.statusCode >= 500) {
          success = 'server-error';
        } else if (res.statusCode >= 400) {
          success = 'client-error';
        }

        for (let stat of [success, 'all']) {
          let k = [name, stat].join('.');
          monitor.measure(k, d[0] * 1000 + d[1] / 1000000);
          monitor.count(k);
        }
      } catch (e) {
        debug('Error while compiling response times: %s, %j', err, err, err.stack);
      }
    };
    res.once('finish', send);
    res.once('close', send);
    next();
  };
}

/**
 * Given a function that operates on a
 * single message, this will time it and
 * report via the monitor.
 */
export function timedHandler (monitor, name, handler) {
  return async (message) => {
    let start = process.hrtime();
    let success = 'success';
    try {
      await handler(message);
    } catch (e) {
      success = 'error';
      throw e;
    } finally {
      let d = process.hrtime(start);
      for (let stat of [success, 'all']) {
        let k = [name, stat].join('.');
        monitor.measure(k, d[0] * 1000 + d[1] / 1000000);
        monitor.count(k);
      }
    }
  };
}

/**
 * Given a process name, this will report basic
 * OS-level usage statistics like CPU and Memory
 * on a minute-by-minute basis.
 *
 * Returns a function that can be used to stop monitoring.
 */
export function resources (monitor, proc, seconds) {
  let interval = setInterval(() => {
    usage.lookup(process.pid, {keepHistory: true}, (err, result) => {
      if (err) {
        debug('Failed to get usage statistics, err: %s, %j',  err, err, err.stack);
        return;
      }
      monitor.measure('process.' + proc + '.cpu', result.cpu);
      monitor.measure('process.' + proc + '.mem', result.memory);
    });
  }, seconds * 1000);

  return () => clearInterval(interval);
}