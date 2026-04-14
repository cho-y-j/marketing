import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";

@Injectable()
export class AdminRuleService {
  constructor(private prisma: PrismaService) {}

  async findAll(params?: { industry?: string; isActive?: boolean }) {
    const where: any = {};
    if (params?.industry) where.industry = params.industry;
    if (params?.isActive !== undefined) where.isActive = params.isActive;

    return this.prisma.keywordRule.findMany({
      where,
      orderBy: [{ industry: "asc" }, { priority: "desc" }, { createdAt: "asc" }],
    });
  }

  async findOne(id: string) {
    const rule = await this.prisma.keywordRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundException("룰을 찾을 수 없습니다");
    return rule;
  }

  async create(data: {
    industry: string;
    industryName: string;
    subCategory?: string;
    pattern: string;
    priority?: number;
  }) {
    return this.prisma.keywordRule.create({ data });
  }

  async update(
    id: string,
    data: {
      industry?: string;
      industryName?: string;
      subCategory?: string;
      pattern?: string;
      priority?: number;
      isActive?: boolean;
    },
  ) {
    await this.findOne(id);
    return this.prisma.keywordRule.update({ where: { id }, data });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.keywordRule.delete({ where: { id } });
  }

  async getIndustries() {
    const rules = await this.prisma.keywordRule.findMany({
      select: { industry: true, industryName: true },
      distinct: ["industry"],
      orderBy: { industryName: "asc" },
    });
    return rules;
  }
}
