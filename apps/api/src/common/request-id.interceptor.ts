import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { runWithRequestContext } from "@dang/observability";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";

type RequestLike = {
  headers: Record<string, string | string[] | undefined>;
};

type ReplyLike = {
  header?: (name: string, value: string) => void;
  setHeader?: (name: string, value: string) => void;
};

@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<RequestLike>();
    const reply = http.getResponse<ReplyLike>();

    const incoming = request.headers["x-request-id"];
    const fromHeader = Array.isArray(incoming) ? incoming[0] : incoming;
    const requestId =
      fromHeader && fromHeader.length > 0 ? fromHeader : randomUUID();
    request.headers["x-request-id"] = requestId;

    if (typeof reply.header === "function") {
      reply.header("x-request-id", requestId);
    } else if (typeof reply.setHeader === "function") {
      reply.setHeader("x-request-id", requestId);
    }

    return new Observable((subscriber) => {
      runWithRequestContext({ requestId }, () => {
        next
          .handle()
          .pipe(tap(() => undefined))
          .subscribe(subscriber);
      });
    });
  }
}
