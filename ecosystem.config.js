module.exports = {
  apps: [
    {
      name: 'desocial-server',
      script: 'dist/src/main.js',
      env: {
        NODE_ENV: 'production',
        NEST_PORT: 3002,
        NODE_TLS_REJECT_UNAUTHORIZED: '0',
      },
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '512M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
    },
  ],
};
