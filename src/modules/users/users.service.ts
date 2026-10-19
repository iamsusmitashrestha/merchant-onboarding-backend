import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserRole } from './user-role.enum';
import { User } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  list(role?: UserRole): Promise<User[]> {
    return this.users.find({
      where: role ? { role } : {},
      order: { email: 'ASC' },
    });
  }

  findById(id: string): Promise<User | null> {
    return this.users.findOne({ where: { id } });
  }

  /** Includes the password hash — only for the login flow. */
  findByEmailWithPassword(email: string): Promise<User | null> {
    return this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email: email.trim().toLowerCase() })
      .getOne();
  }
}
