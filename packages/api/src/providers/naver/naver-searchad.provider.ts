import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import * as crypto from "crypto";

export interface KeywordStats {
  relKeyword: string;
  monthlyPcQcCnt: number;
  monthlyMobileQcCnt: number;
  monthlyAvePcClkCnt: number;
  monthlyAveMobileClkCnt: number;
  monthlyAvePcCtr: number;
  monthlyAveMobileCtr: number;
  plAvgDepth: number;
  compIdx: string;
}

export interface RelatedKeyword {
  relKeyword: string;
  monthlyPcQcCnt: number;
  monthlyMobileQcCnt: number;
  compIdx: string;
}

@Injectable()
export class NaverSearchadProvider {
  private readonly logger = new Logger(NaverSearchadProvider.name);
  private readonly apiKey: string;
  private readonly secretKey: string;
  private readonly customerId: string;
  private readonly baseUrl = "https://api.searchad.naver.com";

  constructor(private config: ConfigService) {
    this.apiKey = this.config.get("NAVER_SEARCHAD_API_KEY") || "";
    this.secretKey = this.config.get("NAVER_SEARCHAD_SECRET_KEY") || "";
    this.customerId = this.config.get("NAVER_SEARCHAD_CUSTOMER_ID") || "";
  }

  // HMAC-SHA256 서명 생성
  private generateSignature(timestamp: string, method: string, uri: string): string {
    const message = `${timestamp}.${method}.${uri}`;
    return crypto
      .createHmac("sha256", this.secretKey)
      .update(message)
      .digest("base64");
  }

  // API 헤더 생성
  private getHeaders(method: string, uri: string) {
    const timestamp = String(Date.now());
    return {
      "X-Timestamp": timestamp,
      "X-API-KEY": this.apiKey,
      "X-Customer": this.customerId,
      "X-Signature": this.generateSignature(timestamp, method, uri),
      "Content-Type": "application/json",
    };
  }

  // 키워드별 월간 검색량 (절대값)
  async getKeywordStats(keywords: string[]): Promise<KeywordStats[]> {
    if (!this.apiKey) {
      this.logger.warn("검색광고 API 키가 설정되지 않았습니다");
      return [];
    }

    const uri = "/keywordstool";
    // 공백 제거 (네이버 검색광고 API는 공백 없는 키워드 선호)
    const cleanKeywords = keywords.map((kw) => kw.replace(/\s+/g, ""));
    const resp = await axios.get(`${this.baseUrl}${uri}`, {
      params: {
        hintKeywords: cleanKeywords.join(","),
        showDetail: 1,
      },
      headers: this.getHeaders("GET", uri),
      timeout: 10000,
    });

    return resp.data.keywordList || [];
  }

  // 연관 키워드 조회
  async getRelatedKeywords(keyword: string): Promise<RelatedKeyword[]> {
    if (!this.apiKey) {
      this.logger.warn("검색광고 API 키가 설정되지 않았습니다");
      return [];
    }

    const uri = "/keywordstool";
    const resp = await axios.get(`${this.baseUrl}${uri}`, {
      params: {
        hintKeywords: keyword,
        showDetail: 1,
      },
      headers: this.getHeaders("GET", uri),
      timeout: 10000,
    });

    // 입력한 키워드 제외한 연관 키워드만 반환
    const allKeywords: RelatedKeyword[] = resp.data.keywordList || [];
    return allKeywords.filter(
      (kw) => kw.relKeyword.toLowerCase() !== keyword.toLowerCase(),
    );
  }

  // 총 월간 검색량 (PC + 모바일)
  getTotalMonthlySearch(stat: KeywordStats): number {
    const pc =
      typeof stat.monthlyPcQcCnt === "number" ? stat.monthlyPcQcCnt : 0;
    const mobile =
      typeof stat.monthlyMobileQcCnt === "number"
        ? stat.monthlyMobileQcCnt
        : 0;
    return pc + mobile;
  }
}
