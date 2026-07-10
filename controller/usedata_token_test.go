package controller

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

type tokenQuotaResponse struct {
	Success bool              `json:"success"`
	Message string            `json:"message"`
	Data    []model.QuotaData `json:"data"`
}

func setupTokenQuotaControllerTestDB(t *testing.T) {
	t.Helper()
	db := setupModelListControllerTestDB(t)
	require.NoError(t, db.AutoMigrate(&model.Token{}, &model.QuotaData{}))
	require.NoError(t, model.DB.Create(&model.Token{Id: 11, UserId: 1, Key: "sk-primary", Name: "primary"}).Error)
	require.NoError(t, model.DB.Create(&model.Token{Id: 22, UserId: 2, Key: "sk-backup", Name: "backup"}).Error)
	// token id 33 is intentionally NOT created → simulates a deleted token
	rows := []model.QuotaData{
		{UserID: 1, Username: "alice", TokenID: 11, ModelName: "gpt-a", CreatedAt: 1100, Count: 2, Quota: 100, TokenUsed: 40},
		{UserID: 1, Username: "alice", TokenID: 11, ModelName: "gpt-a", CreatedAt: 1200, Count: 1, Quota: 50, TokenUsed: 20},
		{UserID: 2, Username: "bob", TokenID: 22, ModelName: "gpt-b", CreatedAt: 1100, Count: 3, Quota: 200, TokenUsed: 60},
		{UserID: 3, Username: "carol", TokenID: 33, ModelName: "gpt-c", CreatedAt: 1100, Count: 1, Quota: 30, TokenUsed: 10},
	}
	for i := range rows {
		require.NoError(t, model.DB.Create(&rows[i]).Error)
	}
}

func decodeTokenQuotaResponse(t *testing.T, recorder *httptest.ResponseRecorder) tokenQuotaResponse {
	t.Helper()
	require.Equal(t, http.StatusOK, recorder.Code)
	var payload tokenQuotaResponse
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &payload))
	require.True(t, payload.Success, payload.Message)
	return payload
}

func TestGetQuotaDatesByTokenGroupsAndResolvesNames(t *testing.T) {
	setupTokenQuotaControllerTestDB(t)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/data/tokens?start_timestamp=1000&end_timestamp=2000", nil)

	GetQuotaDatesByToken(ctx)

	payload := decodeTokenQuotaResponse(t, recorder)
	// 4 rows expected: token 11 @1100, token 11 @1200, token 22 @1100, token 33 @1100
	require.Len(t, payload.Data, 4)

	byKey := make(map[string]model.QuotaData, len(payload.Data))
	for _, r := range payload.Data {
		byKey[fmt.Sprintf("%d_%d", r.TokenID, r.CreatedAt)] = r
	}

	primary1100, ok := byKey["11_1100"]
	require.True(t, ok)
	require.Equal(t, "primary", primary1100.TokenName)
	require.Equal(t, "alice", primary1100.Username)
	require.Equal(t, 100, primary1100.Quota)

	primary1200, ok := byKey["11_1200"]
	require.True(t, ok)
	require.Equal(t, "primary", primary1200.TokenName)
	require.Equal(t, 50, primary1200.Quota)

	backup, ok := byKey["22_1100"]
	require.True(t, ok)
	require.Equal(t, "backup", backup.TokenName)
	require.Equal(t, 200, backup.Quota)

	deleted, ok := byKey["33_1100"]
	require.True(t, ok)
	require.Empty(t, deleted.TokenName, "deleted token must have empty TokenName")
	require.Equal(t, "carol", deleted.Username)
}

func TestGetQuotaDatesByTokenModelGroupsAndResolvesNames(t *testing.T) {
	setupTokenQuotaControllerTestDB(t)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/data/tokens/models?start_timestamp=1000&end_timestamp=2000", nil)

	GetQuotaDatesByTokenModel(ctx)

	payload := decodeTokenQuotaResponse(t, recorder)
	// Rows expected (grouped by token_id, model_name, created_at):
	//   token=11, model=gpt-a, ts=1100  (count=2, quota=100)
	//   token=11, model=gpt-a, ts=1200  (count=1, quota=50)
	//   token=22, model=gpt-b, ts=1100  (count=3, quota=200)
	//   token=33, model=gpt-c, ts=1100  (count=1, quota=30, deleted token)
	require.Len(t, payload.Data, 4)

	byKey := make(map[string]model.QuotaData, len(payload.Data))
	for _, r := range payload.Data {
		byKey[fmt.Sprintf("%d_%s_%d", r.TokenID, r.ModelName, r.CreatedAt)] = r
	}

	m11, ok := byKey["11_gpt-a_1100"]
	require.True(t, ok)
	require.Equal(t, "primary", m11.TokenName)
	require.Equal(t, "gpt-a", m11.ModelName)
	require.Equal(t, 100, m11.Quota)

	deleted, ok := byKey["33_gpt-c_1100"]
	require.True(t, ok)
	require.Empty(t, deleted.TokenName, "deleted token must have empty TokenName")
	require.Equal(t, "carol", deleted.Username)
}

func TestGetQuotaDatesByTokenModelFiltersByTokenID(t *testing.T) {
	setupTokenQuotaControllerTestDB(t)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/data/tokens/models?start_timestamp=1000&end_timestamp=2000&token_id=11", nil)

	GetQuotaDatesByTokenModel(ctx)

	payload := decodeTokenQuotaResponse(t, recorder)
	require.Len(t, payload.Data, 2)
	for _, r := range payload.Data {
		require.Equal(t, 11, r.TokenID)
		require.Equal(t, "gpt-a", r.ModelName)
	}
}
