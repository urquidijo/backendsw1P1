import { Controller, Post, Body, UseGuards, Request, Get } from '@nestjs/common';
import { AiChatService } from './ai-chat.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

class GenerateUMLDto {
  @IsString()
  @IsNotEmpty()
  prompt: string;

  @IsString()
  @IsNotEmpty()
  diagramId: string;
}

class ChatDto {
  @IsString()
  @IsNotEmpty()
  message: string;

  @IsString()
  @IsOptional()
  diagramId?: string;

  @IsString()
  @IsOptional()
  image?: string; // Base64 encoded image
}

@Controller('ai-chat')
@UseGuards(JwtAuthGuard)
export class AiChatController {
  constructor(private aiChatService: AiChatService) {}

  @Post('generate-uml')
  async generateUML(@Body() generateUMLDto: GenerateUMLDto, @Request() req) {
    return this.aiChatService.generateUMLFromPrompt(
      generateUMLDto.prompt,
      generateUMLDto.diagramId,
      req.user.userId,
    );
  }

  @Post('chat')
  async chat(@Body() chatDto: ChatDto, @Request() req) {
    return this.aiChatService.chatWithAI(
      chatDto.message,
      chatDto.diagramId,
      req.user.userId,
      chatDto.image,
    );
  }

  @Get('suggestions')
  async getSuggestions() {
    return {
      suggestions: [
        'Crear un sistema de farmacia',
        'Diseñar una ferretería con productos y ventas',
        'Crear un e-commerce con productos y pedidos',
        'Modelar un sistema de biblioteca',
        'Generar un blog con posts y comentarios',
        'Crear un sistema de restaurante',
        'Diseñar un hospital con pacientes y doctores',
        'Modelar una escuela con estudiantes y profesores'
      ]
    };
  }

  @Get('templates')
  async getTemplates() {
    return {
      templates: [
        {
          id: 'farmacia',
          name: 'Sistema de Farmacia',
          description: 'Sistema completo de farmacia con medicamentos, clientes, ventas y proveedores',
          prompt: 'Crear un sistema de farmacia con Medicamento, Cliente, Venta y Proveedor'
        },
        {
          id: 'ferreteria',
          name: 'Sistema de Ferretería',
          description: 'Gestión de ferretería con productos, categorías, clientes y ventas',
          prompt: 'Diseñar una ferretería con Producto, Categoría, Cliente, Venta y Proveedor'
        },
        {
          id: 'ecommerce',
          name: 'E-commerce',
          description: 'Plataforma de compras online con usuarios, productos, pedidos y pagos',
          prompt: 'Crear un e-commerce con Usuario, Producto, Categoría, Pedido y Pago'
        },
        {
          id: 'biblioteca',
          name: 'Biblioteca',
          description: 'Sistema de préstamos con libros, autores y prestamistas',
          prompt: 'Modelar una biblioteca con Libro, Autor, Prestamista y Préstamo'
        },
        {
          id: 'restaurante',
          name: 'Restaurante',
          description: 'Sistema de pedidos con clientes, menú y órdenes',
          prompt: 'Crear un restaurante con Cliente, Plato, Pedido y Mesa'
        }
      ]
    };
  }
}