const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const logger = require('../config/logger');

const router = express.Router();

// Service endpoints configuration
const services = {
  auth: {
    target: `http://localhost:${process.env.AUTH_SERVICE_PORT || 3001}`,
    pathRewrite: { '^/api/v1/auth': '' }
  },
  tenant: {
    target: `http://localhost:${process.env.TENANT_SERVICE_PORT || 3002}`,
    pathRewrite: { '^/api/v1/tenant': '' }
  },
  i18n: {
    target: `http://localhost:${process.env.I18N_SERVICE_PORT || 3003}`,
    pathRewrite: { '^/api/v1/i18n': '' }
  },
  notification: {
    target: `http://localhost:${process.env.NOTIFICATION_SERVICE_PORT || 3004}`,
    pathRewrite: { '^/api/v1/notification': '' }
  },
  files: {
    target: `http://localhost:${process.env.FILE_DMS_SERVICE_PORT || 3005}`,
    pathRewrite: { '^/api/v1/files': '' }
  },
  pmis: {
    target: `http://localhost:${process.env.PMIS_COLLAB_SERVICE_PORT || 3006}`,
    pathRewrite: { '^/api/v1/pmis': '' }
  }
};

// Create proxy middleware for each service
Object.keys(services).forEach(serviceKey => {
  const service = services[serviceKey];
  
  const proxyMiddleware = createProxyMiddleware({
    target: service.target,
    changeOrigin: true,
    pathRewrite: service.pathRewrite,
    onProxyReq: (proxyReq, req, res) => {
      // Add tenant context to headers
      if (req.headers[process.env.TENANT_HEADER?.toLowerCase() || 'x-tenant-id']) {
        proxyReq.setHeader(
          process.env.TENANT_HEADER || 'X-Tenant-Id', 
          req.headers[process.env.TENANT_HEADER?.toLowerCase() || 'x-tenant-id']
        );
      }
      
      // Add request tracing
      proxyReq.setHeader('X-Request-Id', req.headers['x-request-id'] || require('uuid').v4());
      proxyReq.setHeader('X-Gateway-Forward', 'true');
      
      logger.debug(`Proxying request to ${serviceKey} service`, {
        method: req.method,
        originalUrl: req.originalUrl,
        targetUrl: `${service.target}${proxyReq.path}`
      });
    },
    onError: (err, req, res) => {
      logger.error(`Proxy error for ${serviceKey} service`, {
        error: err.message,
        method: req.method,
        originalUrl: req.originalUrl
      });
      
      res.status(503).json({
        code: 'SERVICE_UNAVAILABLE',
        messageKey: 'error.service_unavailable',
        params: { service: serviceKey }
      });
    }
  });

  router.use(`/${serviceKey}`, proxyMiddleware);
});

// API status endpoint
router.get('/status', (req, res) => {
  res.json({
    gateway: 'healthy',
    timestamp: new Date().toISOString(),
    services: Object.keys(services),
    version: '1.0.0'
  });
});

module.exports = router;