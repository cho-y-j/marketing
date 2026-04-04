import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { PrismaModule } from "./common/prisma.module";
import { AuthModule } from "./modules/auth/auth.module";
import { StoreModule } from "./modules/store/store.module";
import { AnalysisModule } from "./modules/analysis/analysis.module";
import { CompetitorModule } from "./modules/competitor/competitor.module";
import { KeywordModule } from "./modules/keyword/keyword.module";
import { BriefingModule } from "./modules/briefing/briefing.module";
import { ContentModule } from "./modules/content/content.module";
import { SubscriptionModule } from "./modules/subscription/subscription.module";
import { NotificationModule } from "./modules/notification/notification.module";
import { AIModule } from "./providers/ai/ai.module";
import { NaverModule } from "./providers/naver/naver.module";
import { DataModule } from "./providers/data/data.module";
import { JobsModule } from "./jobs/jobs.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env.local", ".env"],
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AIModule,
    NaverModule,
    DataModule,
    AuthModule,
    StoreModule,
    AnalysisModule,
    CompetitorModule,
    KeywordModule,
    BriefingModule,
    ContentModule,
    SubscriptionModule,
    NotificationModule,
    JobsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
