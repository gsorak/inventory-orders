# syntax=docker/dockerfile:1

# --- Build stage: compile the Spring Boot jar with the Maven Wrapper ----------
FROM eclipse-temurin:21-jdk-noble AS build
WORKDIR /workspace

COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
COPY src/main/ src/main/

# Tests need Docker (Testcontainers) and run outside the image build: ./mvnw test
RUN --mount=type=cache,target=/root/.m2 \
    ./mvnw -B -q -Dmaven.test.skip=true package \
    && cp target/*.jar app.jar

# --- Runtime stage: JRE only, non-root ----------------------------------------
FROM eclipse-temurin:21-jre-noble
WORKDIR /app

COPY --from=build /workspace/app.jar app.jar

# Heap sized from the container memory limit (the Fargate task size); on OutOfMemoryError the JVM exits so that ECS
# replaces the task instead of leaving it running in a broken state.
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75 -XX:+ExitOnOutOfMemoryError"

# Built-in unprivileged user of the Ubuntu base image.
USER 1000:1000

EXPOSE 8080

# Exec form: the JVM is PID 1 and receives SIGTERM for Spring Boot's graceful shutdown.
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
