// src/tasks/tasks.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { ScraperService } from '../scraper/scraper.service';
import { CronJob } from 'cron';

interface JobInfo {
  name: string;
  nextRun: Date;
  cronTime: string;
}

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly scraperService: ScraperService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  /**
   * Ejecuta el scraper todos los días a las 3:00 AM
   * Esto se puede configurar según las necesidades
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM, {
    name: 'scraping-diario',
    timeZone: 'Europe/Madrid', // Ajustar a la zona horaria deseada
  })
  async handleCronScraping() {
    this.logger.log('Iniciando tarea programada de scraping (diaria)');

    try {
      const result = await this.scraperService.runScraperForAllTiendas({
        headless: true,
      });

      this.logger.log(
        `Tarea de scraping completada. Se procesaron ${result.tiendas_procesadas} tiendas`,
      );
    } catch (error) {
      this.logger.error(
        `Error en tarea programada de scraping: ${error.message}`,
      );
    }
  }

  /**
   * Crea una tarea programada personalizada
   */
  createCustomCronJob(name: string, hour: number, minute: number): void {
    // Verificar si ya existe un trabajo con ese nombre
    try {
      const existingJob = this.schedulerRegistry.getCronJob(name);
      if (existingJob) {
        this.logger.warn(
          `Ya existe una tarea programada con el nombre ${name}`,
        );
        return;
      }
    } catch (error) {
      // El trabajo no existe, continuamos
    }

    // Crear expresión cron: minuto hora * * *
    const cronExpression = `${minute} ${hour} * * *`;

    this.logger.log(
      `Creando tarea programada: ${name} con expresión ${cronExpression}`,
    );

    const job = new CronJob(
      cronExpression,
      async () => {
        this.logger.log(`Ejecutando tarea programada: ${name}`);

        try {
          await this.scraperService.runScraperForAllTiendas({
            headless: true,
          });

          this.logger.log(`Tarea ${name} completada con éxito`);
        } catch (error) {
          this.logger.error(`Error en tarea ${name}: ${error.message}`);
        }
      },
      null,
      true,
      'Europe/Madrid',
    ); // Ajustar zona horaria según necesidades

    this.schedulerRegistry.addCronJob(name, job);
    job.start();

    this.logger.log(`Tarea ${name} programada y activada`);
  }

  /**
   * Elimina una tarea programada
   */
  deleteCustomCronJob(name: string): void {
    try {
      const job = this.schedulerRegistry.getCronJob(name);

      job.stop();
      this.schedulerRegistry.deleteCronJob(name);

      this.logger.log(`Tarea ${name} eliminada correctamente`);
    } catch (error) {
      this.logger.error(`Error al eliminar tarea ${name}: ${error.message}`);
      throw new Error(`Tarea ${name} no encontrada`);
    }
  }

  /**
   * Obtiene todas las tareas programadas
   */
  getAllCronJobs(): JobInfo[] {
    const jobs: JobInfo[] = [];
    const jobNames = this.schedulerRegistry.getCronJobs().keys();

    for (const name of jobNames) {
      const job = this.schedulerRegistry.getCronJob(name);
      const nextRun = job.nextDate().toJSDate();

      jobs.push({
        name,
        nextRun,
        cronTime: job.cronTime.toString(),
      });
    }

    return jobs;
  }
}
