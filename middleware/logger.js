// Logging middleware - logs method, URL, status code, and response time
const loggingMiddleware = (req, res, next) => {
  const startTime = Date.now();
  const originalSend = res.send;

  res.send = function (data) {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;
    const method = req.method;
    const url = req.originalUrl;

    console.log(`[${new Date().toISOString()}] ${method} ${url} - Status: ${statusCode} - Duration: ${duration}ms`);

    res.send = originalSend;
    return res.send(data);
  };

  next();
};

module.exports = loggingMiddleware;
