module.exports = {
  apps: [
    {
      name: 'img-optimize',
      script: './index.js',
      instances: 'max',
      exec_mode: 'cluster',
      watch: false,
      // Load env file by PM2 ecosystem environment
      // PM2 v5 expects string or object, not array
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
