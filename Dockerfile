FROM node:24-alpine AS frontend
WORKDIR /src
COPY package*.json ./
RUN npm ci
COPY web ./web
RUN npm run build
FROM golang:1.27-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY *.go ./
COPY web ./web
COPY --from=frontend /src/web/dist ./web/dist
RUN CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o /portal .
RUN mkdir -p /data
FROM scratch
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=build --chown=10001:10001 /data /data
COPY --from=build /portal /usr/local/bin/portal
USER 10001:10001
EXPOSE 8090
ENV PORTAL_DB=/data/portal.db
CMD ["/usr/local/bin/portal"]
