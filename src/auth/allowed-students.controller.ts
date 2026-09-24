import {
  Body, Controller, Delete, Get, Param, Patch, Post, UploadedFile, UseGuards, UseInterceptors, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import * as path from 'path';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { Roles } from './decorators/roles.decorator';
import { AllowedStudentsService } from './allowed-students.service';
import { AddStudentsDto } from './dto/add-students.dto';
import { UpdateStudentDto } from './dto/update-student.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin/students')
export class AllowedStudentsController {
  constructor(private allowedStudents: AllowedStudentsService) {}

  @Get()
  async list() {
    return this.allowedStudents.list();
  }

  @Post()
  async add(@Body() dto: AddStudentsDto) {
    return this.allowedStudents.add(dto.emails);
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      fileFilter: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext !== '.csv' && ext !== '.txt') {
          return cb(new BadRequestException('Only .csv or .txt files are allowed'), false);
        }
        cb(null, true);
      },
    }),
  )
  async upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    const emails = file.buffer.toString('utf-8').split(/[\r\n,;]+/);
    return this.allowedStudents.add(emails);
  }

  @Patch(':email')
  async update(@Param('email') email: string, @Body() dto: UpdateStudentDto) {
    await this.allowedStudents.update(email, dto.newEmail);
    return { ok: true };
  }

  @Delete('all')
  async clear() {
    await this.allowedStudents.clear();
    return { ok: true };
  }

  @Delete(':email')
  async remove(@Param('email') email: string) {
    await this.allowedStudents.remove(email);
    return { ok: true };
  }
}
