import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash("admin1234", 10);

  // 1. 기존 admin@admin.com → 슈퍼관리자로 승격
  const existing = await prisma.user.findUnique({
    where: { email: "admin@admin.com" },
  });
  if (existing) {
    await prisma.user.update({
      where: { email: "admin@admin.com" },
      data: {
        role: "SUPER_ADMIN",
        name: "슈퍼관리자",
        phone: "010-0000-0000",
        password: hashedPassword,
      },
    });
    console.log("✅ admin@admin.com → SUPER_ADMIN 승격 완료");
  } else {
    await prisma.user.create({
      data: {
        email: "admin@admin.com",
        name: "슈퍼관리자",
        password: hashedPassword,
        role: "SUPER_ADMIN",
        phone: "010-0000-0000",
        provider: "email",
      },
    });
    console.log("✅ admin@admin.com 슈퍼관리자 생성 완료");
  }

  // 2. 테스트 개인사업자
  const testUser = await prisma.user.upsert({
    where: { email: "test@test.com" },
    update: {
      role: "INDIVIDUAL",
      name: "테스트 사장님",
      password: hashedPassword,
      phone: "010-1234-5678",
      companyName: "테스트 맛집",
      businessNumber: "123-45-67890",
    },
    create: {
      email: "test@test.com",
      name: "테스트 사장님",
      password: hashedPassword,
      role: "INDIVIDUAL",
      phone: "010-1234-5678",
      companyName: "테스트 맛집",
      businessNumber: "123-45-67890",
      provider: "email",
    },
  });
  console.log("✅ test@test.com 개인사업자 생성 완료");

  // 3. 테스트 가맹사업자
  const franchiseUser = await prisma.user.upsert({
    where: { email: "franchise@test.com" },
    update: {
      role: "FRANCHISE",
      name: "테스트 가맹본부",
      password: hashedPassword,
      phone: "010-9876-5432",
      companyName: "테스트 프랜차이즈",
      businessNumber: "987-65-43210",
    },
    create: {
      email: "franchise@test.com",
      name: "테스트 가맹본부",
      password: hashedPassword,
      role: "FRANCHISE",
      phone: "010-9876-5432",
      companyName: "테스트 프랜차이즈",
      businessNumber: "987-65-43210",
      provider: "email",
    },
  });
  console.log("✅ franchise@test.com 가맹사업자 생성 완료");

  console.log("\n=== 로그인 정보 ===");
  console.log("슈퍼관리자: admin@admin.com / admin1234");
  console.log("개인사업자: test@test.com / admin1234");
  console.log("가맹사업자: franchise@test.com / admin1234");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
