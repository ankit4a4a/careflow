const mongoose = require('mongoose');

// Finance / pharmacy / HRM / appointments use MongoDB transactions. Transactions only exist on a replica set
// (Atlas, Railway Mongo with replica set, ...). A plain local `mongod` is a standalone server and rejects them
// ("Transaction numbers are only allowed on a replica set member or mongos"), which made saving fail.
// On a standalone server we run the same code WITHOUT a transaction instead of failing.
function enableStandaloneFallback() {
  if (mongoose.Connection.prototype.__cfStandalonePatched) return;
  const original = mongoose.Connection.prototype.startSession;
  mongoose.Connection.prototype.startSession = async function (...args) {
    const session = await original.apply(this, args);
    session.withTransaction = async function (fn) { return fn(session); };
    session.startTransaction = function () {};
    session.commitTransaction = async function () {};
    session.abortTransaction = async function () {};
    return session;
  };
  mongoose.Connection.prototype.__cfStandalonePatched = true;
}

async function connectDB(uri = process.env.MONGODB_URI) {
  if (!uri) throw new Error('MONGODB_URI is required');
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000, maxPoolSize: Number(process.env.MONGO_POOL_SIZE || 20) });
  try {
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    const supportsTransactions = Boolean(hello.setName) || hello.msg === 'isdbgrid';
    if (!supportsTransactions) {
      enableStandaloneFallback();
      console.warn('[db] MongoDB is a standalone server (no replica set): running without transactions. Use MongoDB Atlas / a replica set in production for full safety.');
    }
  } catch (e) {
    console.warn('[db] could not detect MongoDB topology:', e.message);
  }
  return mongoose.connection;
}
module.exports = connectDB;
