# Endpoint Registry

> Define uma vez. Regista centralmente. Consome em qualquer lado.
> _Built in Angola. Designed for everyone._

Endpoints HTTP declarativos e tipados para JavaScript e TypeScript. Zero dependências de runtime, Fetch por defeito, sem framework obrigatória.

English: [README.md](./README.md) · Decisões da spec: [docs/pt-AO/DECISOES.md](./docs/pt-AO/DECISOES.md)

Estado: **0.1.0**, primeira implementação da especificação 0.1.0-draft. Ainda não publicada; ver os pontos pendentes no documento de decisões.

## Começar

```ts
import { createRegistry, defineEndpoint, typed } from "endpoint-registry";

type User = { id: string; name: string };

const api = createRegistry(
  {
    users: {
      get: defineEndpoint({
        method: "GET",
        path: "/users/:id",
        responseSchema: typed<User>(),
      }),
      create: defineEndpoint({
        method: "POST",
        path: "/users",
        body: typed<{ name: string }>(),
        responseSchema: typed<User>(),
      }),
    },
  },
  { baseUrl: "https://api.example.ao", timeoutMs: 8000 },
);

const user = await api.users.get({ params: { id: "123" } }); // tipado como User
await api.users.create({ body: { name: "Aquiles" } });
```

Em JavaScript simples funciona igual (sem compilação). Os tipos de params, query, body e resposta são inferidos; entradas erradas dão erro de compilação.

## Funcionalidades

- **Definições** inertes e congeladas: `defineEndpoint({ method, path, baseUrl?, headers?, query?, body?, responseSchema?, metadata? })`.
- **Registos** isolados (sem estado global) e aninháveis. `composeRegistry([a, b])` junta árvores e **falha em colisões de nomes**, a menos que escolhas `keep-first` / `replace`.
- **Resolução** determinística: params de caminho codificados, regras de query documentadas, `..` bloqueado.
- **Transporte**: `fetch` global por defeito, ou qualquer `(request: Request) => Promise<Response>`.
- **Middleware**: modelo cebola; pode substituir o pedido, interromper a cadeia e observar respostas.
- **Validação** opcional: qualquer objecto com `parse()` (Zod e semelhantes) ou a interface Standard Schema. `typed<T>()` dá tipos sem custo em runtime.
- **Cancelamento**: `signal` e `timeoutMs` por chamada ou por registo.
- **Erros** com `code` estável, sem tokens, headers, corpos ou query strings.

## Opções

```ts
createRegistry(tree, {
  baseUrl, // o do endpoint tem prioridade; em browsers usa a origem da página
  headers, // objecto ou função (async); registo < endpoint < chamada
  fetch, // transporte próprio (testes, dev local, adaptadores)
  middleware: [], // o primeiro é o mais externo
  timeoutMs, // sem timeout por defeito
  credentials,
  redirect, // passados ao Request
});
```

Por chamada: `{ params, query, body, headers, signal, timeoutMs, parseAs }`. `parseAs: "response"` devolve a `Response` crua.

## Erros

| Classe                             | `code`                |
| ---------------------------------- | --------------------- |
| `DefinitionError`                  | `DEFINITION_ERROR`    |
| `RegistryError` (colisão)          | `REGISTRY_COLLISION`  |
| `ResolutionError`                  | `RESOLUTION_ERROR`    |
| `RequestValidationError`           | `REQUEST_VALIDATION`  |
| `ResponseValidationError`          | `RESPONSE_VALIDATION` |
| `ResponseParseError`               | `RESPONSE_PARSE`      |
| `NetworkError`                     | `NETWORK_ERROR`       |
| `HttpError` (`status`, `response`) | `HTTP_ERROR`          |
| `TimeoutError`                     | `TIMEOUT`             |
| `AbortedError`                     | `ABORTED`             |
| `ConfigurationError`               | `CONFIGURATION_ERROR` |

Verifica com `error.code` ou `instanceof`, nunca analisando a mensagem.

## Middleware

```ts
const timing: Middleware = async (ctx, next) => {
  const t = performance.now();
  const res = await next();
  console.log(ctx.label, res.status, Math.round(performance.now() - t), "ms");
  return res;
};
```

Os pedidos que chegam ao middleware incluem os headers reais (ex.: `Authorization`). Usa `redactHeaders()` antes de registar em logs.

## Notas de segurança

- Sem retries automáticos (nada não idempotente é repetido).
- Um `baseUrl` dinâmico construído a partir de input do utilizador é um risco de SSRF que a biblioteca não consegue eliminar.
- Validação de schema não substitui validação no servidor.
- `HttpError.response` é devolvida por ler; lê ou cancela o corpo para libertar a ligação.

## Desenvolvimento

```bash
npm install
npm test          # typecheck + testes de tipos + testes unitários + smoke de runtime
node examples/node/server-demo.mjs   # depois de `npm run build`
```

Os testes usam um `fetch` em memória, por isso não precisam de rede nem de servidor. Ao consumir os `.d.ts` são precisos tipos Web ambiente (`lib: ["DOM"]` ou `@types/node`).

## Compatibilidade

Só APIs Web Standard; sem `window`, `document` ou `process` (garantido por um teste). Mínimos propostos: Node ≥ 18.17, Deno 2.x, Bun ≥ 1.1, browsers evergreen. O Node está verificado localmente; Deno e Bun correm no CI (`.github/workflows/ci.yml`).

## Licença

MIT (a confirmar pelo responsável do projecto).
