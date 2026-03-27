module.exports = {
  apps: [
    {
      name: 'lattice-tracker',
      script: 'src/index.js',
      cwd: '/opt/lattice-tracker/server',
      instances: 1,
      env: {
        NODE_ENV: 'production',
        LATTICE_PORT: 3377,
        LATTICE_HOST: '127.0.0.1',
        LATTICE_DB_PATH: '/var/lib/lattice-tracker/lattice.db',
      },
      // Load token from env file
      env_file: '/etc/lattice-tracker/env',
      max_restarts: 10,
      restart_delay: 5000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
