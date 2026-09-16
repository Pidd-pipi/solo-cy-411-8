export const appConfig = {
  port: Number(process.env.PORT || 3000),
  jwtSecret: process.env.JWT_SECRET || 'change_me_to_a_long_random_string',
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
  composeProjectName: process.env.COMPOSE_PROJECT_NAME || 'carbontrack',
  frontendPort: Number(process.env.FRONTEND_PORT || 18411),
  backendPort: Number(process.env.BACKEND_PORT || 19411)
};

