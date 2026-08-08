const crypto = require('crypto');

const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();

module.exports = { now, uid };
