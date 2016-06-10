'use strict';

/*
 * This check fails for assignment of values on an Object argument, and does not
 * allow for argument type-checking/default setters. */
/* eslint-disable no-param-reassign */
/*
 * This check is invalid. Functions defined outside of a class are still hoisted. */
/* eslint-disable no-use-before-define */

const Errors = require('../../errors');
const Signature = require('../../signature');
const Store = require('./store');

const REQUIRED_HEADERS = ['x-auth-key', 'x-auth-signature', 'date', 'host'];
const DEFAULT_SKEW = 5000;

/**
 * Validate a request's authentication headers against a local database of keys
 *
 * @module Provider/Local
 */

/**
 * Create a control layer function
 *
 * @param  {Object} options
 * @param  {String} options.algorithm   The hash algorithm to use for signature generation
 * @param  {Number} options.skew        The maximum time-skew, in milliseconds,
 *                                      allowed between the server's time and the request's Date header
 * @param  {Object} options.db          Local/Store constructor options
 * @param  {Object} options.db.signal   The OS signal upon which keys should be reloaded from disk
 * @param  {Object} options.db.path     The local file in which keys are defined
 *
 * @return {Function}                   A control layer for the router
 */
function authn(options) {
  options = Object.assign({
    algorithm: 'sha256',
    skew: DEFAULT_SKEW
  }, options);

  // Sign/verify parameters
  const algorithm = options.algorithm;
  const skew = Number(options.skew);

  const db = new Store(options.db);

  db.on('error', (err) => Log.error(err));

  // Return a request handler
  return function handle(req, res, next) {
    Log.info('Local token validator');

    validate(skew, req);

    const signature = new Signature(algorithm, {
      Method: req.method,
      Date: req.date,
      Host: req.headers.host,
      URI: req.url
    });

    signature.sign(db.lookup(req.key));
    signature.verify(req.signature);

    next();
  };
}

/**
 * Validate correctness of a request's parameters before trying to verify its signature
 *
 * @param  {Number} skew                  Maximum allowed skew, in milliseconds, between the server's time
 *                                        and the request's Date header
 * @param  {HTTP.IncomingMessage} request The request to validate
 *
 * @throws {Errors.RequestError}          If a required header is missing
 * @throws {Errors.AuthorizationError}    If the Data header skew is too large
 */
function validate(skew, request) {
  REQUIRED_HEADERS.forEach(function check(header) {
    if (!request.headers.hasOwnProperty(header)) {
      throw new Errors.RequestError(`Missing header ${header}`);
    }
  });

  // Validate Date header
  request.date = new Date(request.headers.date);
  if (isNaN(request.date)) {
    throw new Errors.RequestError('Invalid Date header');
  }

  // Verify that the request date is close to $NOW
  const now = Date.now();

  if (Math.abs(now - request.date.getTime()) > skew) {
    throw new Errors.AuthorizationError('Request data skew is too large');
  }

  // Attach the key-pair to the request object
  request.key = request.headers['x-auth-key'];
  request.signature = request.headers['x-auth-signature'];
}

exports.Store = Store;
exports.authn = authn;
exports.validate = validate;