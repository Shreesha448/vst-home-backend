# Use Node.js image
FROM node:18-alpine
RUN apk update && apk upgrade --no-cache

WORKDIR /app

# Copy dependency files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy application source
COPY . .

# Expose app port
EXPOSE 3000

# Start application
CMD ["npm", "start"]
