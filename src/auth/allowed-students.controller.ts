import {
  Body, Controller, Delete, Get, Param, Patch, Post, Req, UploadedFile, UseGuards, UseInterceptors, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import * as path from 'path';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { SuperAdminGuard } from './super-admin.guard';
import { Roles } from './decorators/roles.decorator';
import { AllowedStudentsService } from './allowed-students.service';
import { AddStudentsDto } from './dto/add-students.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { SetAdminDto } from './dto/set-admin.dto';
import { UsersService } from '../users/users.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin/students')
export class AllowedStudentsController {
  constructor(
    private allowedStudents: AllowedStudentsService,
    private users: UsersService,
  ) {}

  @Get()
  async list() {
    return this.allowedStudents.list();
  }

  @Post()
  async add(@Body() dto: AddStudentsDto) {
    return this.allowedStudents.add(dto.emails);
  }

  @Post('teachers')
  @UseGuards(SuperAdminGuard)
  async addTeachers(@Body() dto: AddStudentsDto) {
    const result = await this.allowedStudents.addTeachers(dto.emails);
    await Promise.all(result.emails.map((email) => this.users.setRoleIfExists(email, 'admin')));
    return { added: result.added, promoted: result.promoted };
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      fileFilter: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext !== '.csv' && ext !== '.txt') {
          return cb(new BadRequestException('Solo se aceptan archivos .csv o .txt'), false);
        }
        cb(null, true);
      },
    }),
  )
  async upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No se recibió ningún archivo');
    const emails = file.buffer.toString('utf-8').split(/[\r\n,;]+/);
    return this.allowedStudents.add(emails);
  }

  @Patch(':email/admin')
  @UseGuards(SuperAdminGuard)
  async setAdmin(@Param('email') email: string, @Body() dto: SetAdminDto) {
    await this.allowedStudents.setAdminFlag(email, dto.isAdmin);
    await this.users.setRoleIfExists(email, dto.isAdmin ? 'admin' : 'student');
    return { ok: true };
  }

  @Patch(':email')
  async update(@Param('email') email: string, @Body() dto: UpdateStudentDto, @Req() req: any) {
    await this.allowedStudents.update(email, dto.newEmail, req.user.email);
    return { ok: true };
  }

  @Delete('all')
  async clear() {
    await this.allowedStudents.clear();
    return { ok: true };
  }

  @Delete(':email')
  async remove(@Param('email') email: string, @Req() req: any) {
    const { wasAdmin } = await this.allowedStudents.remove(email, req.user.email);
    if (wasAdmin) await this.users.setRoleIfExists(email, 'student');
    return { ok: true };
  }
}
