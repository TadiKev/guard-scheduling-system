FROM node:18

WORKDIR /app

# copy package files first for faster rebuilds
COPY package.json package-lock.json* ./

# install deps
RUN npm install

# copy rest of the source
COPY . .

# expose port 3000 so docker-compose can map it
EXPOSE 3000

ENV BROWSER=none
ENV HOST=0.0.0.0

CMD ["npm", "run", "dev"]
