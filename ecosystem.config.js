/**
 * PM2 ecosystem config — production process management.
 *
 * Two processes:
 *   cdp-api    — Express HTTP server (src/server.ts → dist/server.js)
 *   cdp-worker — BullMQ worker (src/workers/workerBoot.ts → dist/workers/workerBoot.js)
 *
 * Usage:
 *   pm2 start ecosystem.config.js --env production
 *   pm2 reload cdp-api       ← zero-downtime reload
 *   pm2 restart cdp-worker   ← restart (worker jobs complete before restart)
 *   pm2 save                 ← persist process list across reboots
 *   pm2 startup              ← generate startup script
 */

module.exports = {
  apps: [
    {
      name: 'cdp-api',
      script: 'dist/server.js',
      instances: 1,               // Single instance — Redis handles rate limiting state
      exec_mode: 'fork',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      // Restart policy
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 3000,
      // Memory threshold — restart if API uses more than 400MB (t4g.micro safe)
      max_memory_restart: '400M',
      // Log config
      out_file: '/var/log/pm2/cdp-api-out.log',
      error_file: '/var/log/pm2/cdp-api-error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      // Graceful shutdown — wait up to 10s for in-flight requests
      kill_timeout: 10000,
      // Zero-downtime reload: keep old process until new one is ready
      wait_ready: true,
      listen_timeout: 8000,
    },
    {
      name: 'cdp-worker',
      script: 'dist/workers/workerBoot.js',
      instances: 1,
      exec_mode: 'fork',
      env_production: {
        NODE_ENV: 'production',
        WORKER_CONCURRENCY: 3,
      },
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 5000,
      max_memory_restart: '300M',
      out_file: '/var/log/pm2/cdp-worker-out.log',
      error_file: '/var/log/pm2/cdp-worker-error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      // Give the worker 30s to finish the current job before killing it
      kill_timeout: 30000,
    },
  ],
};
