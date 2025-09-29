import { Controller, Get, Param, Put } from '@nestjs/common';
import { Body } from '@nestjs/common';
import { MeetingService } from './meeting.service';
import { UpdateMeetingDto } from './dto/update.dto';
import { Meeting } from './meeting.entity';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { UseGuards } from '@nestjs/common';
import { UsePipes } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';

@UseGuards(JwtAuthGuard)
@Controller('meeting')
export class MeetingController {
  constructor(private readonly meetingService: MeetingService) {}

  @Put('by-parent/:id')
  async updateByParentId(@Param('id') id: string, @Body() updateMeetingDto: UpdateMeetingDto): Promise<Meeting> {
    return await this.meetingService.updateByParentId(id, updateMeetingDto);
  }

  @Get('by-parent/:id')
  async getByParentId(@Param('id') id: string): Promise<Meeting[]> {
    return await this.meetingService.getByParentId(id);
  }

  @Get(':id')
  async getById(@Param('id') id: string): Promise<Meeting> {
    return await this.meetingService.findById(id);
  }
}
