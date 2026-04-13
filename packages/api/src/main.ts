import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 전역 파이프 설정
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS 설정
  app.enableCors({
    origin: [
      "http://localhost:3000",
      "http://localhost:3001",
      "http://localhost:3200",
      "http://1.221.158.115:3000",
      "http://1.221.158.115:3200",
      process.env.NEXTAUTH_URL || "",
    ].filter(Boolean),
    credentials: true,
  });

  // Swagger 설정
  const config = new DocumentBuilder()
    .setTitle("마케팅 인텔리전스 API")
    .setDescription("자영업자를 위한 AI 마케팅 매니저 API")
    .setVersion("0.1.0")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api/docs", app, document);

  const port = process.env.PORT || 4000;
  await app.listen(port, "0.0.0.0");
  console.log(`API 서버 실행 중: http://localhost:${port}`);
  console.log(`Swagger 문서: http://localhost:${port}/api/docs`);
}
bootstrap();
