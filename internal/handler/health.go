package handler

import (
	"context"
	"net/http"
	"time"

	"cyberstrike-ai/internal/database"

	"github.com/gin-gonic/gin"
)

// Healthz is a dependency-free liveness probe. It must stay unauthenticated so
// process supervisors and load balancers can use it before the first login.
func Healthz(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

// Readyz reports whether the process can serve requests that need the
// database. Details are deliberately omitted from the response so a probe
// cannot leak filesystem paths or SQL errors.
func Readyz(db *database.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if db == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"status": "unavailable"})
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
		defer cancel()
		if err := db.PingContext(ctx); err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"status": "unavailable"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	}
}
