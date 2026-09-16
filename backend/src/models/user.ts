import { Column, CreateDateColumn, Entity, JoinTable, ManyToMany, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Activity } from './activity';
import { Goal } from './goal';
import { Role } from './role';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: number;

  @Column({ length: 64, unique: true })
  username!: string;

  @Column({ length: 128, unique: true })
  email!: string;

  @Column({ name: 'password_hash', length: 128 })
  passwordHash!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  avatar!: string | null;

  @Column({ length: 64, default: 'Shanghai' })
  region!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @OneToMany(() => Activity, (activity) => activity.user)
  activities!: Activity[];

  @OneToMany(() => Goal, (goal) => goal.user)
  goals!: Goal[];

  @ManyToMany(() => Role, (role) => role.users, { eager: true })
  @JoinTable({
    name: 'user_roles',
    joinColumn: { name: 'user_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'role_id', referencedColumnName: 'id' }
  })
  roles!: Role[];
}
