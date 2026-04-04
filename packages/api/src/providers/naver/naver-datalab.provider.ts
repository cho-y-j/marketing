import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";

export interface TrendData {
  startDate: string;
  endDate: string;
  timeUnit: string;
  results: Array<{
    title: string;
    keywords: string[];
    data: Array<{ period: string; ratio: number }>;
  }>;
}

export interface KeywordGroup {
  groupName: string;
  keywords: string[];
}

@Injectable()
export class NaverDatalabProvider {
  private readonly logger = new Logger(NaverDatalabProvider.name);
  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor(private config: ConfigService) {
    this.clientId = this.config.get("NAVER_CLIENT_ID") || "";
    this.clientSecret = this.config.get("NAVER_CLIENT_SECRET") || "";
  }

  // 검색 트렌드 조회 (상대적 검색량)
  async getSearchTrend(
    keywords: string[],
    startDate: string,
    endDate: string,
    timeUnit: "date" | "week" | "month" = "date",
  ): Promise<TrendData> {
    const keywordGroups = keywords.map((kw) => ({
      groupName: kw,
      keywords: [kw],
    }));

    const resp = await axios.post(
      "https://openapi.naver.com/v1/datalab/search",
      {
        startDate,
        endDate,
        timeUnit,
        keywordGroups,
      },
      {
        headers: {
          "X-Naver-Client-Id": this.clientId,
          "X-Naver-Client-Secret": this.clientSecret,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      },
    );

    return resp.data;
  }

  // 키워드 그룹 비교
  async compareKeywords(
    groups: KeywordGroup[],
    startDate: string,
    endDate: string,
  ): Promise<TrendData> {
    const resp = await axios.post(
      "https://openapi.naver.com/v1/datalab/search",
      {
        startDate,
        endDate,
        timeUnit: "month",
        keywordGroups: groups,
      },
      {
        headers: {
          "X-Naver-Client-Id": this.clientId,
          "X-Naver-Client-Secret": this.clientSecret,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      },
    );

    return resp.data;
  }
}
