import { randomBytes } from 'crypto';
const secret = randomBytes(64).toString('hex');
console.log('SESSION_SECRET=' + secret);
