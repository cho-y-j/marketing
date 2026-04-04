import { Global, Module } from "@nestjs/common";
import { NaverSearchProvider } from "./naver-search.provider";
import { NaverDatalabProvider } from "./naver-datalab.provider";
import { NaverSearchadProvider } from "./naver-searchad.provider";
import { NaverPlaceProvider } from "./naver-place.provider";
import { NaverRankCheckerProvider } from "./naver-rank-checker.provider";

@Global()
@Module({
  providers: [
    NaverSearchProvider,
    NaverDatalabProvider,
    NaverSearchadProvider,
    NaverPlaceProvider,
    NaverRankCheckerProvider,
  ],
  exports: [
    NaverSearchProvider,
    NaverDatalabProvider,
    NaverSearchadProvider,
    NaverPlaceProvider,
    NaverRankCheckerProvider,
  ],
})
export class NaverModule {}
