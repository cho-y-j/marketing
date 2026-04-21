import { Module } from "@nestjs/common";
import { IngredientPriceService } from "./ingredient-price.service";
import { IngredientPriceController } from "./ingredient-price.controller";

@Module({
  controllers: [IngredientPriceController],
  providers: [IngredientPriceService],
  exports: [IngredientPriceService],
})
export class IngredientModule {}
