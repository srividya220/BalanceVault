import { app } from './app';
import { config } from './config';
import { connectDatabase } from './database/prisma';
import { applyDatabaseHardening } from './scripts/apply-triggers';

async function bootstrap() {
  try {
    console.log('🚀 Initializing BalanceVault server...');
    await connectDatabase();
    await applyDatabaseHardening();

    const server = app.listen(config.port, () => {
      console.log(`✓ BalanceVault API server is actively running on port ${config.port}`);
      console.log(`  Health Liveness:  http://localhost:${config.port}/api/health`);
      console.log(`  Health Readiness: http://localhost:${config.port}/api/health/ready`);
    });

    const shutdown = async () => {
      console.log('\nShutting down gracefully...');
      server.close(() => {
        console.log('BalanceVault server terminated.');
        process.exit(0);
      });
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (error) {
    console.error('Failed to start BalanceVault server:', error);
    process.exit(1);
  }
}

bootstrap();
