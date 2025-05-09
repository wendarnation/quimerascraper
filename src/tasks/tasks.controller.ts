// src/tasks/tasks.controller.ts
import {
  Controller,
  Post,
  Get,
  Body,
  Delete,
  Param,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { ProgramarScraperDto } from '../scraper/dto/scraper.dto';

// Definir la interfaz para JobInfo aquí también para evitar problemas de importación
interface JobInfo {
  name: string;
  nextRun: Date;
  cronTime: string;
}

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post('programar')
  createCustomCronJob(@Body() params: ProgramarScraperDto) {
    try {
      const name = `scraping-personalizado-${Date.now()}`;
      this.tasksService.createCustomCronJob(name, params.hora, params.minuto);

      return {
        success: true,
        message: `Tarea programada "${name}" creada para ejecutarse todos los días a las ${params.hora}:${params.minuto}`,
        taskName: name,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Error al programar tarea',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete(':name')
  deleteCustomCronJob(@Param('name') name: string) {
    try {
      this.tasksService.deleteCustomCronJob(name);

      return {
        success: true,
        message: `Tarea "${name}" eliminada correctamente`,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Error al eliminar tarea',
        HttpStatus.NOT_FOUND,
      );
    }
  }

  @Get()
  getAllCronJobs(): { success: boolean; count: number; jobs: JobInfo[] } {
    try {
      const jobs = this.tasksService.getAllCronJobs();

      return {
        success: true,
        count: jobs.length,
        jobs,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Error al obtener tareas programadas',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
