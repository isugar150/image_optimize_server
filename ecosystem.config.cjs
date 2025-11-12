module.exports = {
  apps: [
    {
      name: 'img-optimize',
      script: './index.js',
      instances: 'max',
      exec_mode: 'cluster',
      max_memory_restart: '512M',
      exp_backoff_restart_delay: 100,
      watch: false,
      env_file: {
        development: '.env',
        production: '.env.production'
      },
      env: {
        NODE_ENV: 'development'
      },
      env_production: {
        NODE_ENV: 'production'
      }
    }
  ]
};
