import { Module } from '@nestjs/common';
import { PatientSegmentationController } from './patient-segmentation.controller';
import { PatientSegmentationService } from './patient-segmentation.service';
import { SvServices } from '../sv-services/sv.services';
import { UserModule } from '../user/user.module';

@Module({
  imports: [UserModule],
  controllers: [PatientSegmentationController],
  providers: [PatientSegmentationService, SvServices],
  exports: [PatientSegmentationService],
})
export class PatientSegmentationModule {}
