import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';

/** Полный AppModule тянет Telegram и БД — включите при наличии .env и инфраструктуры. */
describe.skip('AppModule (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const { AppModule } = await import('./../src/app.module');
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer()).get('/health').expect(200);
  });

  afterEach(async () => {
    await app.close();
  });
});
