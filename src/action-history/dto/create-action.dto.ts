import { ENUM_TARGET_TYPE } from "./enum-target-type";

export class CreateActionDto {
  targetId: string;
  userId: string;
  message: string;
  target_type: ENUM_TARGET_TYPE
}