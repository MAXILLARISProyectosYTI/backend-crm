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

  async findOneByparentIdLess(parentId: string) {

    return await this.meetingRepository.createQueryBuilder('m')
    .select([
      'm.id as m_id',
      'm.name as m_name',
      'TO_CHAR(m.date_start, \'YYYY-MM-DD HH24:MI:SS\') as date_start'
    ])
    .where('m.parent_id = :parentId', { parentId })
    .getRawOne();
  }

  async findById(id: string) {
    const meeting = await this.meetingRepository.findOne({ where: { id } });
    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }
    return meeting;
  }
}
