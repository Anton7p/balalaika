import { IsInt, Min } from 'class-validator';

export class VpnFailoverDto {
  @IsInt()
  @Min(1)
  fromInboundId!: number;

  @IsInt()
  @Min(1)
  toInboundId!: number;
}
