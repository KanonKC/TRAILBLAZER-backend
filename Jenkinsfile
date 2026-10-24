pipeline {
    parameters {
        choice(name: 'Environment', choices: ['prod', 'dev'], description: 'Deploy in development environment')
        booleanParam(name: 'BuildApp', defaultValue: true, description: 'Rebuild the application container')
        booleanParam(name: 'MigrateDB', defaultValue: true, description: 'Run Prisma migrations')
    }
    triggers {
        githubPush()
    }
    tools {
        git "Default"
    }
    agent {
        label "stargaze-builder"
    }
    environment {
        ENV_FILE=credentials("trailblazer-${params.Environment}")
    }
    stages {
        stage("Checkout Version") {
            steps {
                script {
                    if (params.Environment == 'prod') {
                        echo "🏷️ Checking out branch: main"
                        def scmVars = checkout([
                            $class: 'GitSCM',
                            branches: [[name: '*/main']],
                            userRemoteConfigs: scm.userRemoteConfigs
                        ])
                        env.BUILD_VERSION = scmVars.GIT_COMMIT.take(7)
                    } else if (params.Environment == 'dev') {
                        echo "🏷️ Checking out branch: develop"
                        def scmVars = checkout([
                            $class: 'GitSCM',
                            branches: [[name: '*/develop']],
                            userRemoteConfigs: scm.userRemoteConfigs
                        ])
                        env.BUILD_VERSION = scmVars.GIT_COMMIT.take(7)
                    } else {
                        echo "🚨 Invalid environment: ${params.Environment}"
                        error "Invalid environment: ${params.Environment}"
                    }
                }
            }
        }
        stage("Setup Environment") {
            steps {
                echo "⚙️ Creating environment file with credentials..."
                sh 'cp $ENV_FILE .env'
            }
        }
        stage("Run Container") {
            steps {
                script {
                    def buildOption = params.BuildApp ? "--build" : ""
                    echo "🐳 Starting Docker container (Build: ${params.BuildApp})..."
                    sh "BUILD_VERSION=${env.BUILD_VERSION} docker compose up -d ${buildOption} || docker-compose up -d ${buildOption}"
                }
            }
        }
        stage("Migrate Database") {
            when {
                expression { params.MigrateDB }
            }
            steps {
                echo "🔼 Waiting for app container to be ready..."
                sh '''
                for i in $(seq 1 30); do
                    if docker compose ps app --format "{{.Status}}" 2>/dev/null | grep -q "Up" || docker-compose ps app 2>/dev/null | grep -q "Up"; then
                        echo "✅ App container is running"
                        break
                    fi
                    sleep 1
                done
                '''
                echo "🔼 Running Prisma migrations..."
                sh 'docker compose exec -T app npx prisma migrate deploy || docker-compose exec -T app npx prisma migrate deploy'
            }
        }
    }
    post {
        success {
            echo "🎉 Deployment successful!"
        }
        failure {
            echo "🚨 Deployment failed!"
        }
        always {
            echo "🧹 Cleaning up environment file..."
            sh 'rm -f .env'
        }
    }
}