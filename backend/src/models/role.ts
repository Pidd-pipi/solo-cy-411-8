import { Column, Entity, ManyToMany, PrimaryGeneratedColumn } from 'typeorm';
import { User } from './user';

@Entity('roles')
export class Role {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: number;

  @Column({ length: 32, unique: true })
  name!: string;

  @Column({ length: 128 })
  description!: string;

  @ManyToMany(() => User, (user) => user.roles)
  users!: User[];
}

