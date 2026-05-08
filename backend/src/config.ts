export const config = {
  port: parseInt(process.env.PORT || '3000'),
  host: process.env.HOST || '0.0.0.0',

  postgres: {
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432'),
    user: process.env.PG_USER || 'flashsale',
    password: process.env.PG_PASSWORD || 'flashsale123',
    database: process.env.PG_DATABASE || 'flashsale',
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  },

  sale: {
    productName: process.env.SALE_PRODUCT_NAME || 'Limited Edition Sneakers',
    stock: parseInt(process.env.SALE_STOCK || '100'),
    // Default: sale starts now and lasts 1 hour
    startTime: process.env.SALE_START_TIME || new Date().toISOString(),
    endTime:
      process.env.SALE_END_TIME ||
      new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  },
};
