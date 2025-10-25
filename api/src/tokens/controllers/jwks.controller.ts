import { Controller, Get } from '@nestjs/common';
import { TokenSigningService } from '../token-signing.service.js';

@Controller('.well-known')
export class JwksController {
  constructor(private readonly tokenSigningService: TokenSigningService) {}

  @Get('jwks.json')
  async getJwks() {
    const keys = await this.tokenSigningService.listPublicKeys();
    return {
      keys: keys.map((key) => ({
        kty: 'OKP',
        crv: 'Ed25519',
        kid: key.kid,
        alg: 'EdDSA',
        use: 'sig',
        x: key.x
      }))
    };
  }
}
