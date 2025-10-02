import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Meeting } from './meeting.entity';
import { UpdateMeetingDto } from './dto/update.dto';
import { UserService } from 'src/user/user.service';
import { ActionHistoryService } from 'src/action-history/action-history.service';
import { FilesService } from 'src/files/files.service';

@Injectable()
export class MeetingService {

  constructor(
    @InjectRepository(Meeting)
    private readonly meetingRepository: Repository<Meeting>,
    private readonly userService: UserService,
    private readonly actionHistoryService: ActionHistoryService,
    private readonly filesService: FilesService,
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

  async updateByParentName(parentName: string, updateMeetingDto: UpdateMeetingDto): Promise<Meeting> {
    const meeting = await this.meetingRepository.findOne({ where: { name: parentName } });
    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }
    return await this.meetingRepository.save({ ...meeting, ...updateMeetingDto });
  }

  async findByparentIdLess(parentId: string) {

    return await this.meetingRepository.createQueryBuilder('m')
    .select([
      'm.id as m_id',
      'm.name as m_name',
      'TO_CHAR(m.date_start, \'YYYY-MM-DD HH24:MI:SS\') as date_start'
    ])
    .where('m.parent_id = :parentId', { parentId })
    .getRawMany();
  }

  async findByIdWithDetails(id: string) {
    const meeting = await this.meetingRepository.findOne({ where: { id } });
    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }

    const userAssigned = await this.userService.findOne(meeting.assignedUserId!);

    const teams = await this.userService.getAllTeamsByUser(userAssigned.id);

    const history = await this.actionHistoryService.getRecordByTargetId(meeting.id);

    const files = await this.filesService.findByParentId(meeting.id);

    return { ...meeting, userAssigned: userAssigned.userName, teams: teams, history: history, files: files };
  }

  async create(createMeetingDto: Partial<Meeting>): Promise<Meeting> {
    const meeting = this.meetingRepository.create(createMeetingDto);
    return await this.meetingRepository.save(meeting);
  }

  async getByParentName(parentName: string) {
    return await this.meetingRepository.findOne({ where: { name: parentName } });
  }
}
