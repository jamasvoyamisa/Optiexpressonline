/** PM2: cd /var/www/cotizaciones && pm2 start deploy/ecosystem.config.cjs */
module.exports = {
  apps: [
    {
      name: 'cotizaciones-web',
      cwd: '/var/www/cotizaciones',
      script: 'server/index.js',
      instances: 1,
      autorestart: true,
      max_memory_restart: '400M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
