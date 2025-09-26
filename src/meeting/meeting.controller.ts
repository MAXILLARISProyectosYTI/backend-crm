import { Controller, Param, Put } from '@nestjs/common';
import { Body } from '@nestjs/common';
import { MeetingService } from './meeting.service';
import { UpdateMeetingDto } from './dto/update.dto';
import { Meeting } from './meeting.entity';

@Controller('meeting')
export class MeetingController {
  constructor(private readonly meetingService: MeetingService) {}

  @Put('by-parent/:id')
  async updateByParentId(@Param('id') id: string, @Body() updateMeetingDto: UpdateMeetingDto): Promise<Meeting> {
    return await this.meetingService.updateByParentId(id, updateMeetingDto);
  }
}
