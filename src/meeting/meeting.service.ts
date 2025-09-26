import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Meeting } from './meeting.entity';
import { UpdateMeetingDto } from './dto/update.dto';

@Injectable()
export class MeetingService {

  constructor(
    @InjectRepository(Meeting)
    private readonly meetingRepository: Repository<Meeting>,
  ) {}

  async getByParentId(parentId: string): Promise<Meeting[]> {
    return await this.meetingRepository.find({ where: { parentId } });
  }

  async updateByParentId(parentId: string, updateMeetingDto: UpdateMeetingDto): Promise<Meeting> {
    const meeting = await this.meetingRepository.findOne({ where: { parentId } });
    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }
    return await this.meetingRepository.save({ ...meeting, ...updateMeetingDto });
  }
}
